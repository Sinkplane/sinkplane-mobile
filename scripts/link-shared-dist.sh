#!/bin/bash

# Sinkplane Mobile - Local shared-package dist override
#
# @sinkplane/shared installs from GitHub Packages (see .npmrc), so this repo
# is self-contained and EAS builds resolve the published tarball. For local
# development against the sibling clone (../shared), this script
# points node_modules/@sinkplane/shared/dist at the clone's dist/ build
# output instead of the published one — no publish+reinstall needed.
#
# Usage:
#   ./scripts/link-shared-dist.sh            # link the local clone's dist (default)
#   ./scripts/link-shared-dist.sh --unlink  # restore the published dist
#
# Re-run the link after `pnpm install` / dependency updates: reinstalling
# the package recreates dist/ as a real directory and drops the backup.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}[ok]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[warn]${NC} $1"; }
print_error() { echo -e "${RED}[error]${NC} $1"; }
print_info() { echo -e "${BLUE}[info]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PARENT_DIR="$(dirname "$PROJECT_DIR")"
SHARED_DIR="$PARENT_DIR/shared"
PKG_DIR="$PROJECT_DIR/node_modules/@sinkplane/shared"
DIST_DIR="$PKG_DIR/dist"
BACKUP_DIR="$PKG_DIR/dist.published"
# Absolute target: with pnpm, node_modules/@sinkplane/shared is itself a symlink
# into node_modules/.pnpm/…, so a relative link would resolve from that real
# directory, not from node_modules/@sinkplane/shared.
LINK_TARGET="$SHARED_DIR/dist"

if [[ "${1:-}" == "--unlink" ]]; then
    if [ -L "$DIST_DIR" ]; then
        rm "$DIST_DIR"
        print_success "Removed local dist link"
    else
        print_warning "dist is not linked to the local clone"
    fi
    if [ -d "$BACKUP_DIR" ]; then
        mv "$BACKUP_DIR" "$DIST_DIR"
        print_success "Restored the published dist"
    elif [ ! -e "$DIST_DIR" ]; then
        print_warning "No published dist backup found — restore it with:"
        echo "  pnpm install --force"
    fi
    exit 0
fi

if [ ! -d "$PKG_DIR" ]; then
    print_error "@sinkplane/shared is not installed — run pnpm install first."
    exit 1
fi

if [ ! -d "$SHARED_DIR" ]; then
    print_error "sinkplane-shared clone not found at $SHARED_DIR"
    echo "  Clone it first (./scripts/setup-dev-env.sh does this)."
    exit 1
fi

# Fresh clones don't ship dist/ (gitignored) — build it from the clone.
# Its deps resolve through the node_modules symlink this repo's setup script
# creates (see scripts/setup-dev-env.sh; do NOT run an install there).
if [ ! -d "$SHARED_DIR/dist" ]; then
    print_info "No dist/ in the shared clone — building it..."
    if [ ! -e "$SHARED_DIR/node_modules" ]; then
        print_error "$SHARED_DIR/node_modules is missing (deps resolve from this repo)."
        echo "  Run ./scripts/setup-dev-env.sh to create the symlink."
        exit 1
    fi
    (cd "$SHARED_DIR" && pnpm run build)
    print_success "Built sinkplane-shared dist/"
fi

if [ -L "$DIST_DIR" ]; then
    if [ "$(readlink "$DIST_DIR")" == "$LINK_TARGET" ]; then
        print_success "dist is already linked to the local clone"
        exit 0
    fi
    rm "$DIST_DIR"
elif [ -d "$DIST_DIR" ]; then
    # Keep the published dist around so --unlink can restore it.
    rm -rf "$BACKUP_DIR"
    mv "$DIST_DIR" "$BACKUP_DIR"
fi

ln -s "$LINK_TARGET" "$DIST_DIR"
print_success "Linked node_modules/@sinkplane/shared/dist -> $SHARED_DIR/dist"
print_info "Metro watches the clone via metro.config.js; rebuild with:"
echo "  cd ../shared && pnpm run build"
echo "  (or pnpm exec tsc -p tsconfig.build.json --watch while developing)"
