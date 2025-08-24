package models

import (
	"errors"
	"strings"
	"time"
)

// User represents a user in the system
type User struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Age       int       `json:"age"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// In-memory storage (for testing purposes)
var users = []User{
	{
		ID:        1,
		Name:      "John Doe",
		Email:     "john@example.com",
		Age:       30,
		Active:    true,
		CreatedAt: time.Now().Add(-24 * time.Hour),
		UpdatedAt: time.Now().Add(-24 * time.Hour),
	},
	{
		ID:        2,
		Name:      "Jane Smith",
		Email:     "jane@example.com",
		Age:       25,
		Active:    true,
		CreatedAt: time.Now().Add(-12 * time.Hour),
		UpdatedAt: time.Now().Add(-12 * time.Hour),
	},
}

var nextID = 3

// Validate validates the user data
func (u *User) Validate() error {
	if strings.TrimSpace(u.Name) == "" {
		return errors.New("name is required")
	}
	
	if strings.TrimSpace(u.Email) == "" {
		return errors.New("email is required")
	}
	
	if !strings.Contains(u.Email, "@") {
		return errors.New("invalid email format")
	}
	
	if u.Age < 0 || u.Age > 150 {
		return errors.New("age must be between 0 and 150")
	}
	
	return nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(id int) *User {
	for i := range users {
		if users[i].ID == id {
			return &users[i]
		}
	}
	return nil
}

// CreateUser creates a new user
func CreateUser(user User) *User {
	user.ID = nextID
	nextID++
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()
	
	users = append(users, user)
	return &user
}

// UpdateUser updates an existing user
func UpdateUser(user User) *User {
	for i := range users {
		if users[i].ID == user.ID {
			user.CreatedAt = users[i].CreatedAt // Preserve creation time
			user.UpdatedAt = time.Now()
			users[i] = user
			return &users[i]
		}
	}
	return nil
}

// DeleteUser deletes a user by ID
func DeleteUser(id int) bool {
	for i := range users {
		if users[i].ID == id {
			users = append(users[:i], users[i+1:]...)
			return true
		}
	}
	return false
}

// GetAllUsers returns all users
func GetAllUsers() []User {
	return users
}