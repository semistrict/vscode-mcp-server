package main

import (
	"fmt"
	"os"

	"github.com/example/test-fixture/internal/models"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: cli <command>")
		fmt.Println("Commands: list, create, delete")
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "list":
		listUsers()
	case "create":
		if len(os.Args) < 4 {
			fmt.Println("Usage: cli create <name> <email>")
			os.Exit(1)
		}
		createUser(os.Args[2], os.Args[3])
	case "delete":
		if len(os.Args) < 3 {
			fmt.Println("Usage: cli delete <id>")
			os.Exit(1)
		}
		deleteUser(os.Args[2])
	default:
		fmt.Printf("Unknown command: %s\n", command)
		os.Exit(1)
	}
}

func listUsers() {
	users := models.GetAllUsers()
	fmt.Printf("Found %d users:\n", len(users))
	for _, user := range users {
		fmt.Printf("- ID: %d, Name: %s, Email: %s\n", user.ID, user.Name, user.Email)
	}
}

func createUser(name, email string) {
	user := models.User{
		Name:   name,
		Email:  email,
		Age:    25,
		Active: true,
	}
	
	if err := user.Validate(); err != nil {
		fmt.Printf("Error: %s\n", err)
		os.Exit(1)
	}
	
	createdUser := models.CreateUser(user)
	fmt.Printf("Created user: %+v\n", createdUser)
}

func deleteUser(idStr string) {
	// This function is intentionally incomplete for testing
	fmt.Printf("Would delete user with ID: %s\n", idStr)
}