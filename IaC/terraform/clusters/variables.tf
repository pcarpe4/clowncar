variable "docker_host" {
  type = string
}

variable "clusters" {
  default = {
    "dev-1"   = { workers = 2 }
    "dev-2"   = { workers = 2 }
    "staging" = { workers = 3 }
    "prod"    = { workers = 4 }
  }
}