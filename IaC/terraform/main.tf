terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {
  host = var.docker_host
}

# Network for containers
resource "docker_network" "app_network" {
  name = "${var.app_name}_network"
}

# Redis for backend storage
resource "docker_image" "redis" {
  name = "redis:alpine"
}

resource "docker_container" "redis" {
  name  = "${var.app_name}_redis"
  image = docker_image.redis.image_id

  networks_advanced {
    name = docker_network.app_network.name
  }
}

# Python web app container
resource "docker_image" "python" {
  name = "python:3.11-slim"
}

resource "docker_container" "web" {
  name  = "${var.app_name}_web"
  image = docker_image.python.image_id

  ports {
    internal = 8000
    external = 8000
  }

  networks_advanced {
    name = docker_network.app_network.name
  }

  # Keep container running so Ansible can configure it
  command = ["sleep", "infinity"]
}