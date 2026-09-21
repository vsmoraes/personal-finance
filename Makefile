SHELL := /bin/sh

PNPM := corepack pnpm
COMPOSE ?= docker-compose
IMAGE ?= personal-finance
TAG ?= local
PLATFORM ?= linux/amd64

.PHONY: install build test test-integration e2e verify build-docker build-synology up down logs seed-demo

install:
	$(PNPM) install --frozen-lockfile

build:
	$(PNPM) build

test:
	$(PNPM) test

test-integration:
	$(PNPM) test:integration

e2e:
	$(PNPM) exec playwright install chromium
	$(PNPM) test:e2e

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
