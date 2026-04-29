# ProShop with DevOps Platform

ProShop is a full-stack eCommerce application built using the MERN stack, enhanced with a modern DevOps workflow including containerization, orchestration, and automated deployment.

This project demonstrates how a traditional web application can be transformed into a scalable, production-ready system using Docker, Kubernetes, and infrastructure automation tools.

---

## Tech Stack

### Application Layer
- Frontend: React.js
- Backend: Node.js + Express
- Database: MongoDB

### Infrastructure
- Containerization: Docker
- Multi-container orchestration: Docker Compose
- Reverse Proxy and Load Balancer: NGINX
- Orchestration: Kubernetes (Microk8s)
- Automation: Ansible
- CI/CD: Jenkins (next step)

---

### Check the Infrastucture
- Check load Balancing verification 
for i in {1..6}; do curl -s http://localhost:8081/api/health; echo; done (in terminal)

## Acknowledgements
- Original Repository: https://github.com/bradtraversy/proshop-v2