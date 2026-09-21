SHELL := /bin/sh

PNPM := corepack pnpm
COMPOSE ?= docker-compose
IMAGE ?= personal-finance
TAG ?= local
PLATFORM ?= linux/amd64

.PHONY: install build test test-fast test-integration e2e e2e-install e2e-fast verify verify-fast build-docker build-synology up down logs seed-demo

install:
	$(PNPM) install --frozen-lockfile

build:
	$(PNPM) build

test:
	$(PNPM) test

test-fast:
	$(PNPM) exec vitest run tests/contracts.test.ts tests/domain.test.ts tests/web.test.tsx

test-integration:
	$(PNPM) test:integration

e2e:
	$(PNPM) test:e2e

e2e-install:
	$(PNPM) exec playwright install chromium

e2e-fast:
	$(PNPM) test:e2e --project=desktop --max-failures=1 -g "quick entry persists"

verify-fast:
	$(PNPM) proto:lint
	$(PNPM) proto:check
	$(PNPM) proto:breaking
	$(PNPM) api:check
	$(PNPM) format:check
	$(PNPM) lint
	$(PNPM) typecheck
	$(MAKE) test-fast
	$(PNPM) build

verify:
	$(PNPM) proto:lint
	$(PNPM) proto:check
	$(PNPM) proto:breaking
	$(PNPM) api:check
	$(PNPM) format:check
	$(PNPM) lint
	$(PNPM) typecheck
	$(PNPM) test
	$(PNPM) test:integration
	$(PNPM) build

build-docker:
	docker build --tag $(IMAGE):$(TAG) .

build-synology:
	docker buildx build --platform $(PLATFORM) --tag $(IMAGE):$(TAG) --load .

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f finance

seed-demo:
	@test "$(ENVIRONMENT)" = "development" || (echo "Refusing to seed: set ENVIRONMENT=development explicitly" && exit 1)
	$(PNPM) seed:demo
