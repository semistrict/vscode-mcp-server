package models

import (
	"fmt"
	"strings"
)

// BrokenStruct has intentional issues for testing diagnostics
type BrokenStruct struct {
	UnusedField string
	name        string // should be exported
}

// BrokenFunction has various issues
func BrokenFunction() {
	var unusedVar string
	x := 10
	y := 0
	
	// Division by zero (potential runtime error)
	result := x / y
	
	// Unused variable
	_ = result
	
	// Missing return statement (if this returned something)
	fmt.Println("This function has problems")
	
	// Unreachable code
	return
	fmt.Println("This will never execute")
}

// AnotherBrokenFunction with more issues
func AnotherBrokenFunction(s string) string {
	// Potential nil pointer dereference
	var ptr *string
	return strings.ToUpper(*ptr)
	
	// More unreachable code
	return s
}

// UndefinedFunction calls a function that doesn't exist
func UndefinedFunction() {
	NonExistentFunction() // This will cause a compile error
}