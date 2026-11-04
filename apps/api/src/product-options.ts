import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { BusinessError } from "./business-error.js";
export class VariantInput {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameRu!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameKk!: string;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 100000000 })
  @IsInt()
  @Min(1)
  @Max(100000000)
  priceMinor!: number;
  @ApiProperty({ required: false, type: Boolean, default: true })
  @IsBoolean()
  active = true;
}
export class ChoiceInput {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameRu!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameKk!: string;
  @ApiProperty({ type: "integer", minimum: 0, maximum: 100000000 })
  @IsInt()
  @Min(0)
  @Max(100000000)
  deltaMinor!: number;
  @ApiProperty({ required: false, type: Boolean, default: true })
  @IsBoolean()
  active = true;
}
export class GroupInput {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameRu!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameKk!: string;
  @ApiProperty({ type: "integer", minimum: 0, maximum: 30 })
  @IsInt()
  @Min(0)
  @Max(30)
  minimum!: number;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 30 })
  @IsInt()
  @Min(1)
  @Max(30)
  maximum!: number;
  @ApiProperty({ type: () => [ChoiceInput], minItems: 1, maxItems: 30 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ChoiceInput)
  choices!: ChoiceInput[];
}
export class IncompatiblePairInput {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() firstId!: string;
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() secondId!: string;
}
export class ConfigurationInput {
  @ApiProperty({
    required: false,
    type: () => [IncompatiblePairInput],
    maxItems: 100,
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IncompatiblePairInput)
  incompatiblePairs: IncompatiblePairInput[] = [];
  @ApiProperty({ required: false, type: () => [VariantInput], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VariantInput)
  variants: VariantInput[] = [];
  @ApiProperty({ required: false, type: () => [GroupInput], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GroupInput)
  groups: GroupInput[] = [];
}
export interface SelectedOption {
  id: string;
  nameRu: string;
  nameKk: string;
  deltaMinor: number;
}
export function validateConfiguration(input: ConfigurationInput) {
  const ids = new Set<string>();
  for (const entry of [
    ...input.variants,
    ...input.groups,
    ...input.groups.flatMap((g) => g.choices),
  ]) {
    if (ids.has(entry.id))
      throw new BusinessError(
        "DUPLICATE_OPTION",
        "Идентификаторы вариантов и добавок должны быть уникальными.",
      );
    ids.add(entry.id);
  }
  for (const group of input.groups)
    if (group.minimum > group.maximum || group.maximum > group.choices.length)
      throw new BusinessError(
        "INVALID_OPTIONS",
        "Проверьте минимум и максимум выбора добавок.",
      );
  const selectable = new Set(
      [...input.variants, ...input.groups.flatMap((g) => g.choices)].map(
        (value) => value.id,
      ),
    ),
    seenPairs = new Set<string>();
  for (const pair of input.incompatiblePairs ?? []) {
    const key = [pair.firstId, pair.secondId].sort().join(":");
    if (
      pair.firstId === pair.secondId ||
      !selectable.has(pair.firstId) ||
      !selectable.has(pair.secondId) ||
      seenPairs.has(key)
    )
      throw new BusinessError(
        "INVALID_OPTIONS",
        "Проверьте несовместимые сочетания вариантов и добавок.",
      );
    seenPairs.add(key);
  }
  return input;
}
export function selectOptions(
  basePriceMinor: number,
  definition: unknown,
  variantId?: string,
  choiceIds: string[] = [],
) {
  const configuration = (definition ?? {}) as Partial<ConfigurationInput>,
    variants = configuration.variants ?? [],
    groups = configuration.groups ?? [],
    options: SelectedOption[] = [];
  let price = basePriceMinor;
  if (variants.length) {
    const variant = variants.find((v) => v.id === variantId && v.active);
    if (!variant)
      throw new BusinessError(
        "VARIANT_REQUIRED",
        "Выберите доступный вариант блюда.",
      );
    price = variant.priceMinor;
    options.push({
      id: variant.id,
      nameRu: variant.nameRu,
      nameKk: variant.nameKk,
      deltaMinor: 0,
    });
  } else if (variantId)
    throw new BusinessError("INVALID_VARIANT", "Вариант недоступен.");
  if (new Set(choiceIds).size !== choiceIds.length)
    throw new BusinessError("DUPLICATE_CHOICE", "Добавка выбрана повторно.");
  const known = new Set(
    groups.flatMap((g) => g.choices.filter((c) => c.active).map((c) => c.id)),
  );
  if (choiceIds.some((id) => !known.has(id)))
    throw new BusinessError("INVALID_CHOICE", "Добавка недоступна.");
  const selectedIds = new Set([
    ...choiceIds,
    ...(variantId ? [variantId] : []),
  ]);
  if (
    (configuration.incompatiblePairs ?? []).some(
      (pair) => selectedIds.has(pair.firstId) && selectedIds.has(pair.secondId),
    )
  )
    throw new BusinessError(
      "INCOMPATIBLE_OPTIONS",
      "Эти варианты и добавки нельзя выбрать вместе.",
    );
  for (const group of groups) {
    const selected = group.choices.filter((c) => choiceIds.includes(c.id));
    if (selected.length < group.minimum || selected.length > group.maximum)
      throw new BusinessError(
        "CHOICE_LIMIT",
        "Проверьте обязательные добавки и число выбранных вариантов.",
      );
    for (const choice of selected) {
      price += choice.deltaMinor;
      options.push({
        id: choice.id,
        nameRu: choice.nameRu,
        nameKk: choice.nameKk,
        deltaMinor: choice.deltaMinor,
      });
    }
  }
  if (!Number.isSafeInteger(price) || price < 1 || price > 100000000)
    throw new BusinessError(
      "AMOUNT_LIMIT",
      "Недопустимая итоговая цена блюда.",
    );
  return {
    unitPriceMinor: price,
    options: options.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
