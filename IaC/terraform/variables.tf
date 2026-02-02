variable "docker_host" {
  description = "Docker API endpoint"
  type        = string
}

variable "app_name" {
  description = "Name prefix for resources"
  type        = string
  default     = "homelab"
}