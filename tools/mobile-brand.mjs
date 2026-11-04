import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  rename,
  rm,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import sharp from "sharp";
import { readBrand } from "../packages/config/index.mjs";
const args = process.argv.slice(2),
  path = resolve(
    args.find((a) => !a.startsWith("--")) ?? "brands/demo/brand.json",
  ),
  brand = readBrand(path, { production: args.includes("--production") }),
  root = resolve("apps/mobile"),
  out = resolve(".generated", brand.id, "mobile");
if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(brand.applicationId))
  throw Error(
    "applicationId must be valid for both Android and iOS; underscores are not portable",
  );
const xml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const files = new Map();
const text = async (file) => readFile(join(root, file), "utf8");
const replace = (source, pattern, value) => {
  if (!pattern.test(source))
    throw Error("Native template changed: expected anchor missing");
  return source.replace(
    pattern,
    typeof value === "function" ? value : () => value,
  );
};
files.set("assets/brand.json", JSON.stringify(brand, null, 2) + "\n");
files.set(
  brand.logoAsset,
  await readFile(resolve(dirname(path), brand.logoAsset)),
);
let gradle = await text("android/app/build.gradle.kts");
gradle = replace(
  gradle,
  /namespace = "[^"]+"/,
  "namespace = " + JSON.stringify(brand.applicationId),
);
gradle = replace(
  gradle,
  /applicationId = "[^"]+"/,
  "applicationId = " + JSON.stringify(brand.applicationId),
);
files.set("android/app/build.gradle.kts", gradle);
let manifest = await text("android/app/src/main/AndroidManifest.xml");
manifest = replace(
  manifest,
  /android:label="[^"]+"/,
  'android:label="' + xml(brand.displayName) + '"',
);
if (!manifest.includes("android.permission.INTERNET"))
  manifest = manifest.replace(
    "<application",
    '<uses-permission android:name="android.permission.INTERNET"/>\n    <application',
  );
files.set("android/app/src/main/AndroidManifest.xml", manifest);
files.set(
  "android/app/src/main/kotlin/" +
    brand.applicationId.replaceAll(".", "/") +
    "/MainActivity.kt",
  `package ${brand.applicationId}\n\nimport io.flutter.embedding.android.FlutterActivity\n\nclass MainActivity : FlutterActivity()\n`,
);
let info = await text("ios/Runner/Info.plist");
for (const key of ["CFBundleDisplayName", "CFBundleName"])
  info = replace(
    info,
    new RegExp("(<key>" + key + "</key>\\s*<string>)[^<]*(</string>)"),
    (_match, start, end) => start + xml(brand.displayName) + end,
  );
files.set("ios/Runner/Info.plist", info);
files.set(
  "ios/Runner.xcodeproj/project.pbxproj",
  (await text("ios/Runner.xcodeproj/project.pbxproj")).replace(
    /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
    (value) =>
      "PRODUCT_BUNDLE_IDENTIFIER = " +
      brand.applicationId +
      (value.includes(".RunnerTests;") ? ".RunnerTests" : "") +
      ";",
  ),
);
const webManifest = JSON.parse(await text("web/manifest.json"));
Object.assign(webManifest, {
  name: brand.displayName,
  short_name: brand.displayName,
  background_color: brand.surfaceColor,
  theme_color: brand.primaryColor,
  description: brand.displayName,
});
files.set("web/manifest.json", JSON.stringify(webManifest, null, 2) + "\n");
let html = await text("web/index.html");
html = replace(
  html,
  /<title>[^<]*<\/title>/,
  "<title>" + xml(brand.displayName) + "</title>",
);
html = html.replace(
  /(<meta name="apple-mobile-web-app-title" content=")[^"]+/,
  (_match, start) => start + xml(brand.displayName),
);
files.set("web/index.html", html);
const logo = await readFile(resolve(dirname(path), brand.logoAsset));
files.set(
  "assets/brand-logo.png",
  await sharp(logo)
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer(),
);
const icon = async (size) =>
  sharp(logo)
    .resize(Math.round(size * 0.72), Math.round(size * 0.72), {
      fit: "contain",
      background: brand.primaryColor,
    })
    .extend({
      top: Math.floor(size * 0.14),
      bottom: size - Math.round(size * 0.72) - Math.floor(size * 0.14),
      left: Math.floor(size * 0.14),
      right: size - Math.round(size * 0.72) - Math.floor(size * 0.14),
      background: brand.primaryColor,
    })
    .flatten({ background: brand.primaryColor })
    .png()
    .toBuffer();
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}))
  files.set(
    `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
    await icon(size),
  );
const iosIcons = JSON.parse(
  await text("ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"),
);
for (const item of iosIcons.images) {
  if (!item.filename) continue;
  files.set(
    "ios/Runner/Assets.xcassets/AppIcon.appiconset/" + item.filename,
    await icon(
      Math.round(
        Number(item.size.split("x")[0]) * Number(item.scale.replace("x", "")),
      ),
    ),
  );
}
for (const size of [192, 512])
  for (const prefix of ["Icon", "Icon-maskable"])
    files.set(`web/icons/${prefix}-${size}.png`, await icon(size));
files.set("web/favicon.png", await icon(32));
files.set(
  "android/app/src/main/res/values/brand_colors.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="brand_surface">${brand.surfaceColor}</color></resources>\n`,
);
for (const file of [
  "android/app/src/main/res/drawable/launch_background.xml",
  "android/app/src/main/res/drawable-v21/launch_background.xml",
]) {
  let content = await text(file);
  content = content.replace(
    /android:drawable="[^"]+"/,
    'android:drawable="@color/brand_surface"',
  );
  files.set(file, content);
}
const launch = JSON.parse(
  await text("ios/Runner/Assets.xcassets/LaunchImage.imageset/Contents.json"),
);
for (const item of launch.images)
  files.set(
    "ios/Runner/Assets.xcassets/LaunchImage.imageset/" + item.filename,
    await icon(168 * Number(item.scale.replace("x", ""))),
  );
const rgb = brand.surfaceColor
  .slice(1)
  .match(/../g)
  .map((value) => String(parseInt(value, 16) / 255));
files.set(
  "ios/Runner/Base.lproj/LaunchScreen.storyboard",
  (await text("ios/Runner/Base.lproj/LaunchScreen.storyboard")).replace(
    /<color key="backgroundColor"[^>]*\/>/,
    `<color key="backgroundColor" red="${rgb[0]}" green="${rgb[1]}" blue="${rgb[2]}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>`,
  ),
);
for (const [density, scale] of Object.entries({
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
}))
  files.set(
    `android/app/src/main/res/drawable-${density}/brand_splash_logo.png`,
    await icon(144 * scale),
  );
for (const file of [
  "android/app/src/main/res/drawable/launch_background.xml",
  "android/app/src/main/res/drawable-v21/launch_background.xml",
]) {
  files.set(
    file,
    `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/brand_surface"/><item><bitmap android:gravity="center" android:src="@drawable/brand_splash_logo"/></item></layer-list>\n`,
  );
}
files.set(
  "android/app/src/main/res/values-v31/styles.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<resources><style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar"><item name="android:windowSplashScreenBackground">@color/brand_surface</item><item name="android:windowSplashScreenAnimatedIcon">@drawable/brand_splash_logo</item><item name="android:windowBackground">@drawable/launch_background</item></style></resources>\n`,
);
for (const [file, content] of files) {
  if (args.includes("--dry-run")) continue;
  const target = join(out, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
if (args.includes("--apply") && !args.includes("--dry-run")) {
  // Only explicit, documented native identity/assets are managed. Application code and signing configuration are never copied from brand inputs.
  for (const [file] of files) {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    const tmp = target + ".brand-tmp";
    await copyFile(join(out, file), tmp);
    await rename(tmp, target);
  }
  // Flutter's generated starter package has a known Activity; remove only that exact template file.
  const old =
    "android/app/src/main/kotlin/com/example/food_delivery_starter/MainActivity.kt";
  if (!files.has(old)) await rm(join(root, old), { force: true });
}
console.log(
  `Brand ${brand.id}: ${files.size} native identity/assets ${args.includes("--dry-run") ? "validated; no writes" : args.includes("--apply") ? "applied" : "generated in " + out}`,
);
