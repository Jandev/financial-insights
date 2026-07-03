.PHONY: dev build up down logs

dev: ## Start local development server (Vite, hot-reload)
	npm run dev

build: ## Build Docker image
	docker build -t financial-insights .

up: ## Start container via docker compose (builds if needed)
	docker compose up --build -d

down: ## Stop and remove container
	docker compose down

logs: ## Tail container logs
	docker compose logs -f
