package db

import (
	"context"
	"log"

	"cloud.google.com/go/datastore"
	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Connect(connectionString string) {
	var err error
	Pool, err = pgxpool.New(context.Background(), connectionString)
	if err != nil {
		log.Fatalf("Unable to create connection pool: %v\n", err)
	}

	err = Pool.Ping(context.Background())
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}

	log.Println("Successfully connected to database")
}

func Close() {
	if Pool != nil {
		Pool.Close()
		log.Println("Database connection closed")
	}
}

var DsClient *datastore.Client

func InitDatastore(ctx context.Context, projectID string) {
	c, err := datastore.NewClient(ctx, projectID)
	if err != nil {
		log.Fatal(err)
	}
	DsClient = c
}
