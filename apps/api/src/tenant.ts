import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Database } from "./database.js";
import { Branding } from "./branding.js";
@Injectable()
export class Tenant {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Branding) private readonly branding: Branding,
  ) {}
  async assert() {
    try {
      const binding = await this.db.orm.brandSettings.findUnique({
        where: { id: 1 },
      });
      if (binding?.slug !== this.branding.brand.id)
        throw new Error("Brand/database mismatch");
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
