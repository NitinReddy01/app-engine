package config

import (
	"log"
	"os"
	"strconv"
)

type Config struct {
	Port           string
	DB_URL         string
	AllowedOrigins []string
}

func Load() *Config {
	portString := getEnv("PORT")
	if portString == "" {
		log.Fatalf("Missing port in env variables")
	}
	_, err := strconv.Atoi(portString)
	if err != nil {
		log.Fatalf("Invalid port: %s", portString)
	}
	// dbUrl := getEnv("DATABASE_URL")
	// if dbUrl == "" {
	// 	log.Fatalf("Missing DB URL in env variables")
	// }

	config := &Config{
		Port: portString,
		// DB_URL: dbUrl,
	}
	return config
}

func getEnv(key string) string {
	value, ok := os.LookupEnv(key)
	if ok {
		return value
	}
	return ""
}
