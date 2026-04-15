SHELL := /usr/bin/env bash

.DEFAULT_GOAL := help

.PHONY: help install build build-core test typecheck native clean

help:
	@printf "Available targets:\n"
	@printf "  install    Install workspace dependencies\n"
	@printf "  build      Build the project\n"
	@printf "  build-core Build the core runtime packages\n"
	@printf "  test       Run the test suite\n"
	@printf "  typecheck  Run TypeScript type checking\n"
	@printf "  native     Build native components\n"
	@printf "  clean      Remove generated build outputs\n"

install:
	npm install

build:
	npm run build

build-core:
	npm run build:core

test:
	npm test

typecheck:
	npm run typecheck:extensions

native:
	npm run build:native

clean:
	rm -rf dist dist-test
