all:
	node make

test:
	@echo Testing js…
	@node js/test

.PHONY: all test
