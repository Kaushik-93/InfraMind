# Provisions highly available Postgres DB inside AWS US-EAST-1 VPC
resource "aws_db_instance" "postgres_db" {
  identifier            = "ecommerce-prod-orders-db"
  allocated_storage     = 20
  max_allocated_storage = 100
  engine                = "postgres"
  engine_version        = "15.4"
  instance_class        = "db.t4g.medium"
  db_name               = "orders"
  username              = "ecommerce_root"
  password              = "ecommerce-prod-super-secure-pg-key"
  
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.db_subnet.name
  
  multi_az               = true
  publicly_accessible   = false
  storage_encrypted      = true
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "ecommerce-prod-orders-db-final-snapshot"
}

resource "aws_security_group" "db_sg" {
  name        = "ecommerce-prod-db-sg"
  description = "Allow inbound PostgreSQL access from EKS node groups only"
  vpc_id      = "vpc-0985dfc1d8ad2"

  ingress {
    description = "PostgreSQL port"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
