.PHONY: gql web-gql web-dev web-build web-install

gql:
	cd apps/server && pnpm run codegen
	cd apps/desktop && pnpm run codegen

# Web app GraphQL codegen
web-gql:
	cd apps/web && pnpm run codegen

# Web app development server
web-dev:
	cd apps/web && pnpm run dev

# Web app production build
web-build:
	cd apps/web && pnpm run build

# Install web app dependencies
web-install:
	cd apps/web && pnpm install
