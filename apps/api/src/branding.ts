import { Injectable } from "@nestjs/common";
import { readBrand } from "@food/config";
@Injectable()
export class Branding {
  readonly brand = readBrand(
    process.env.BRAND_CONFIG ?? "../../brands/demo/brand.json",
  );
}
