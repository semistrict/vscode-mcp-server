package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/example/test-fixture/internal/handlers"
	"github.com/example/test-fixture/pkg/utils"
	"github.com/gin-gonic/gin"
)

// Server represents the HTTP server configuration
type Server struct {
	router *gin.Engine
	port   string
}

// NewServer creates a new server instance
func NewServer(port string) *Server {
	return &Server{
		router: gin.Default(),
		port:   port,
	}
}

// SetupRoutes configures all the API routes
func (s *Server) SetupRoutes() {
	api := s.router.Group("/api/v1")
	{
		api.GET("/health", handlers.HealthCheck)
		api.GET("/users/:id", handlers.GetUser)
		api.POST("/users", handlers.CreateUser)
		api.PUT("/users/:id", handlers.UpdateUser)
		api.DELETE("/users/:id", handlers.DeleteUser)
	}
}

// Start begins listening on the configured port
func (s *Server) Start() error {
	return s.router.Run(":" + s.port)
}

func main() {
	port := utils.GetEnv("PORT", "8080")
	
	server := NewServer(port)
	server.SetupRoutes()
	
	fmt.Printf("Starting server on port %s\n", port)
	if err := server.Start(); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}