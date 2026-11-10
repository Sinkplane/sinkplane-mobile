SHELL := /bin/bash
.DEFAULT_GOAL := help

CRAP_MAX ?= 6
SCOPE ?= full
BASE ?= origin/main

BIN := node_modules/.bin
JEST := $(BIN)/jest --ci

export CRAP_MAX SCOPE BASE

.PHONY: help setup fmt fmt-check lint typecheck test acceptance coverage crap arch mutate build qa \
	check gauntlet clean

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

setup: ## Install deps and point git at .githooks
	pnpm install --frozen-lockfile
	@if [ "$$(git rev-parse --show-toplevel 2>/dev/null)" = "$$(pwd -P)" ]; then \
		git config core.hooksPath .githooks && echo "git hooks: .githooks"; \
	else \
		echo "git hooks: skipped (not the root of a git repo)"; \
	fi

fmt: ## Rewrite formatting
	$(BIN)/prettier --write --log-level warn .

fmt-check: ## Fail on unformatted files
	$(BIN)/prettier --check --log-level warn .

lint: ## ESLint (zero warnings) and knip (unused files, exports, deps)
	$(BIN)/eslint . --max-warnings=0
	$(BIN)/knip

typecheck: ## tsc in strictest mode
	$(BIN)/tsc --noEmit -p tsconfig.json
	$(BIN)/tsc --noEmit -p scripts/tsconfig.json

test: ## Unit tests (colocated src/**/*.test.ts(x))
	$(JEST) -c jest.config.unit.js

acceptance: ## E2E suite: the real Expo Router app against the in-memory Floatplane API
	$(JEST) -c jest.config.e2e.js

coverage: ## Unit + E2E with coverage thresholds (writes coverage/{unit,e2e}/coverage-final.json)
	rm -rf coverage
	$(JEST) -c jest.config.unit.js --coverage
	$(JEST) -c jest.config.e2e.js --coverage

crap: ## Per-function CRAP from the unit + E2E coverage reports (fails above CRAP_MAX)
	node scripts/crap.mts

arch: ## Dependency rules in .dependency-cruiser.cjs
	$(BIN)/depcruise src __tests__ jest modules scripts index.ts --config .dependency-cruiser.cjs --output-type err-long

mutate: ## Stryker; SCOPE=changed mutates only src files changed vs BASE
	scripts/mutate.sh

build: ## Bundle the app for iOS and Android with Metro (catches resolution errors tsc cannot see)
	rm -rf dist
	$(BIN)/expo export --platform ios --platform android --output-dir dist

qa: build ## Bundle, then list the manual device procedures in qa/procedures
	scripts/qa.sh

check: fmt-check lint typecheck arch coverage crap build ## The gate: stop hook, pre-push, CI

gauntlet: check mutate qa ## check + mutation + QA

clean: ## Remove build, coverage, and mutation output
	rm -rf dist coverage reports .stryker-tmp
