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

resource "docker_image" "alpine" {
  name = "alpine:latest"
}

resource "docker_network" "cluster_network" {
  for_each = var.clusters
  name     = "${each.key}-network"
}

resource "docker_container" "control_plane" {
  for_each = var.clusters
  name     = "${each.key}-control-plane"
  image    = docker_image.alpine.image_id
  command  = ["sleep", "infinity"]

  networks_advanced {
    name = docker_network.cluster_network[each.key].name
  }
}

resource "docker_container" "workers" {
  for_each = merge([
    for cluster_name, cluster in var.clusters : {
      for i in range(cluster.workers) :
      "${cluster_name}-worker-${i}" => {
        cluster = cluster_name
      }
    }
  ]...)

  name    = each.key
  image   = docker_image.alpine.image_id
  command = ["sleep", "infinity"]

  networks_advanced {
    name = docker_network.cluster_network[each.value.cluster].name
  }
}