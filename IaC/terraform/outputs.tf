output "web_container_name" {
  value = docker_container.web.name
}

output "redis_container_name" {
  value = docker_container.redis.name
}

output "web_port" {
  value = docker_container.web.ports[0].external
}