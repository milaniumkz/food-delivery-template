.PHONY: bootstrap dev check test build db-migrate brand-validate
bootstrap:
	node tools/bootstrap.mjs
dev:
	pnpm dev
check:
	pnpm check
test:
	pnpm test
	pnpm test:http
	pnpm test:integration
build:
	pnpm build
db-migrate:
	pnpm db:migrate
brand-validate:
	pnpm exec node tools/brand.mjs brands/$(or $(BRAND),demo)/brand.json --dry-run

brand-apply:
	node tools/mobile-brand.mjs brands/$(or $(BRAND),demo)/brand.json --apply
