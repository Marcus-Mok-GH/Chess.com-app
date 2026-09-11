#!/bin/bash
set -e
pnpm install --frozen-lockfile
echo "Database schema changes must be applied explicitly by the deployment migration step."
