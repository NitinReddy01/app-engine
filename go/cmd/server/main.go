package main

import (
	"go-app-engine/internal/config"
	"go-app-engine/internal/routes"
	"log"
	"net/http"
)

func main() {
	cfg := config.Load()

	// db.Connect(cfg.DB_URL)
	// db.InitDatastore(context.Background(), "eksaq-utils")

	router := routes.New(cfg)

	log.Println("BE server running on", cfg.Port)
	err := http.ListenAndServe(":"+cfg.Port, router)
	if err != nil {
		log.Fatalf("Unable to start the server: %s", err)
	}

}
