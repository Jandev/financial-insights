.PHONY: dev dev-full build up down logs

dev: ## Start local development server (Vite only, localStorage fallback)
	npm run dev

dev-full: ## Start full-stack dev server (Vite + Express, state persists to data/state/)
	npm run dev:full

build: ## Build Docker image
	docker build -t financial-insights .

up: ## Start container via docker compose (builds if needed)
	docker compose up --build -d

down: ## Stop and remove container
	docker compose down

logs: ## Tail container logs
	docker compose logs -f
