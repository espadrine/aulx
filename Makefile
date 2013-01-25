all:
	node make

test:
	@echo Testing js…
	@node js/test
	@echo Testing css…
	@node css/test

.PHONY: all test
