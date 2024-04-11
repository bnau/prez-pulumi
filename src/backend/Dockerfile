FROM golang:1.21 as builder

WORKDIR /app

COPY go.* ./
RUN go mod download

COPY . ./

RUN go build -v -o main

FROM debian:bookworm-slim

COPY --from=builder /app/main /app/main
COPY ./main.html /app/main.html

WORKDIR /app

# Run the web service on container startup.
CMD ["./main"]
