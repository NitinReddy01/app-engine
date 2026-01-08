#!/bin/bash
set -a
source .env.local
set +a
go run cmd/server/main.go