package main

import (
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"html/template"
	"log"
	"net/http"
	"os"
)

type Page struct {
	Visits string
}

type Counter struct {
	gorm.Model
	Value uint
}

var db *gorm.DB
var err error

func htmlHandler(w http.ResponseWriter, req *http.Request) {
	if req.URL.Path != "/" { // Check path here
		http.NotFound(w, req)
		return
	}

	var counter Counter
	db.First(&counter)

	db.Model(&counter).Update("Value", counter.Value+1)

	db.First(&counter)

	p := &Page{Visits: fmt.Sprintf("%d", counter.Value)}
	t, _ := template.ParseFiles("main.html")
	t.Execute(w, p)
}
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func main() {
	host := getEnv("DB_HOST", "localhost")
	user := getEnv("DB_USER", "postgres")
	password := getEnv("DB_PASSWORD", "mysecretpassword")
	port := getEnv("DB_PORT", "5432")
	dbname := getEnv("DB_NAME", "postgres")

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable", host, user, password, dbname, port)
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}

	// Migrate the schema
	db.AutoMigrate(&Counter{})

	var counter Counter
	result := db.First(&counter)

	if result.RowsAffected == 0 {
		db.Create(&Counter{Value: 0})
	}

	http.HandleFunc("/", htmlHandler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}
