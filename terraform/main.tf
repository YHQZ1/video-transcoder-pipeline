terraform {
  required_version = ">= 1.3"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.4"
    }
  }
}

variable "max_bitrate" {
  type    = string
  default = "4K"
}

variable "node_port" {
  type    = number
  default = 30097
}

resource "local_file" "transcoder_output" {
  filename        = "${path.module}/transcoder_output.env"
  file_permission = "0644"
  content         = <<-EOT
    SERVICE=transcoder
    STATUS=READY
    MAX_BITRATE=${var.max_bitrate}
    ENDPOINT=http://localhost:${var.node_port}
  EOT
}

output "env_file" {
  value = local_file.transcoder_output.filename
}
