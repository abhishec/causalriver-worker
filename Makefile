.PHONY: guard typecheck lint build

guard:
	@echo "Starting BrainOS Build Guardian..."
	@bash platform/scripts/build-guardian.sh

typecheck:
	@npx tsc --noEmit -p platform/tsconfig.json

lint:
	@cd platform && npx next lint --max-warnings 50

build:
	@pnpm turbo build --filter=platform
