pipeline {
    agent any

    environment {
        // === Docker Image Names ===
        BACKEND_IMAGE  = "proshopv2-backend"
        FRONTEND_IMAGE = "proshopv2-frontend"

        // === Image Tag: Git commit SHA + build number ===
        IMAGE_TAG = "${env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : 'latest'}-${env.BUILD_NUMBER}"

        // === Docker Registry — isi sesuai registry kamu ===
        // Docker Hub  : your-dockerhub-username
        // Private reg : 192.168.1.100:5000
        REGISTRY = credentials('DOCKER_REGISTRY')

        // === Jenkins Credentials ID untuk Docker Hub / registry ===
        DOCKER_CREDS = 'docker-hub-credentials'

        // === App secrets dari Jenkins Credentials ===
        MONGO_URI  = credentials('PROSHOP_MONGO_URI')
        JWT_SECRET = credentials('PROSHOP_JWT_SECRET')
        PAYPAL_ID  = credentials('PROSHOP_PAYPAL_CLIENT_ID')

        // === Port host yang di-expose ===
        APP_PORT = '8081'

        // === Nama project docker-compose ===
        COMPOSE_PROJECT = "proshopv2"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    stages {

        // ──────────────────────────────────────────────────────────
        // STAGE 1 — CHECKOUT
        // ──────────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                echo "=== [1/7] Checkout Source Code ==="
                checkout scm
                script {
                    env.GIT_COMMIT_MSG = sh(script: 'git log -1 --pretty=%B | head -1', returnStdout: true).trim()
                    env.GIT_AUTHOR     = sh(script: 'git log -1 --pretty=%an', returnStdout: true).trim()
                    echo "Branch  : ${env.GIT_BRANCH}"
                    echo "Commit  : ${env.GIT_COMMIT?.take(7)}"
                    echo "Message : ${env.GIT_COMMIT_MSG}"
                    echo "Author  : ${env.GIT_AUTHOR}"
                    echo "Tag     : ${env.IMAGE_TAG}"
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 2 — INSTALL DEPENDENCIES (parallel)
        // ──────────────────────────────────────────────────────────
        stage('Install Dependencies') {
            parallel {
                stage('Backend – npm install') {
                    steps {
                        echo "=== [2a] Backend: Install ==="
                        sh 'npm ci --prefer-offline 2>/dev/null || npm install'
                    }
                }
                stage('Frontend – npm install') {
                    steps {
                        echo "=== [2b] Frontend: Install ==="
                        dir('frontend') {
                            sh 'npm ci --prefer-offline 2>/dev/null || npm install'
                        }
                    }
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 3 — TEST (parallel)
        // ──────────────────────────────────────────────────────────
        stage('Test') {
            parallel {
                stage('Frontend – Unit Test') {
                    steps {
                        echo "=== [3a] Frontend: Unit Tests ==="
                        dir('frontend') {
                            sh '''
                                CI=true npm test -- \
                                    --coverage \
                                    --coverageReporters=text \
                                    --coverageReporters=lcov \
                                    --watchAll=false \
                                    --passWithNoTests
                            '''
                        }
                    }
                    post {
                        always {
                            script {
                                if (fileExists('frontend/coverage/lcov-report/index.html')) {
                                    publishHTML(target: [
                                        allowMissing         : true,
                                        alwaysLinkToLastBuild: false,
                                        keepAll              : true,
                                        reportDir            : 'frontend/coverage/lcov-report',
                                        reportFiles          : 'index.html',
                                        reportName           : 'Frontend Coverage'
                                    ])
                                }
                            }
                        }
                    }
                }
                stage('Backend – Syntax Check') {
                    steps {
                        echo "=== [3b] Backend: Node.js Syntax Check ==="
                        sh '''
                            find backend -name "*.js" | while read f; do
                                node --check "$f" && echo "  OK: $f" || { echo "  ERR: $f"; exit 1; }
                            done
                            echo "Semua file backend lolos syntax check."
                        '''
                    }
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 4 — BUILD DOCKER IMAGES (parallel)
        // ──────────────────────────────────────────────────────────
        stage('Build Docker Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        echo "=== [4a] Build Backend Image: ${BACKEND_IMAGE}:${IMAGE_TAG} ==="
                        sh """
                            docker build \
                                --label "git.commit=${env.GIT_COMMIT}" \
                                --label "build.number=${env.BUILD_NUMBER}" \
                                -t ${BACKEND_IMAGE}:${IMAGE_TAG} \
                                -t ${BACKEND_IMAGE}:latest \
                                -f backend/Dockerfile \
                                .
                        """
                        sh "docker images ${BACKEND_IMAGE}:${IMAGE_TAG}"
                    }
                }
                stage('Build Frontend') {
                    steps {
                        echo "=== [4b] Build Frontend Image: ${FRONTEND_IMAGE}:${IMAGE_TAG} ==="
                        sh """
                            docker build \
                                --label "git.commit=${env.GIT_COMMIT}" \
                                --label "build.number=${env.BUILD_NUMBER}" \
                                -t ${FRONTEND_IMAGE}:${IMAGE_TAG} \
                                -t ${FRONTEND_IMAGE}:latest \
                                -f frontend/Dockerfile \
                                frontend/
                        """
                        sh "docker images ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                    }
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 5 — PUSH TO REGISTRY
        // Hanya untuk branch main / master
        // ──────────────────────────────────────────────────────────
        stage('Push to Registry') {
            when {
                anyOf { branch 'main'; branch 'master' }
            }
            steps {
                echo "=== [5] Push Images ke Registry ==="
                withCredentials([usernamePassword(
                    credentialsId: "${DOCKER_CREDS}",
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'
                }
                sh """
                    docker tag ${BACKEND_IMAGE}:${IMAGE_TAG}  ${REGISTRY}/${BACKEND_IMAGE}:${IMAGE_TAG}
                    docker tag ${BACKEND_IMAGE}:latest        ${REGISTRY}/${BACKEND_IMAGE}:latest
                    docker tag ${FRONTEND_IMAGE}:${IMAGE_TAG} ${REGISTRY}/${FRONTEND_IMAGE}:${IMAGE_TAG}
                    docker tag ${FRONTEND_IMAGE}:latest       ${REGISTRY}/${FRONTEND_IMAGE}:latest

                    docker push ${REGISTRY}/${BACKEND_IMAGE}:${IMAGE_TAG}
                    docker push ${REGISTRY}/${BACKEND_IMAGE}:latest
                    docker push ${REGISTRY}/${FRONTEND_IMAGE}:${IMAGE_TAG}
                    docker push ${REGISTRY}/${FRONTEND_IMAGE}:latest
                """
                sh 'docker logout'
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 6 — DEPLOY (Rolling, Zero-Downtime)
        // ──────────────────────────────────────────────────────────
        stage('Deploy') {
            when {
                anyOf { branch 'main'; branch 'master' }
            }
            steps {
                echo "=== [6] Rolling Deploy via Docker Compose ==="

                // Buat file .env dari Jenkins credentials
                sh """
                    cat > .env <<EOF
NODE_ENV=production
PORT=5000
MONGO_URI=${MONGO_URI}
JWT_SECRET=${JWT_SECRET}
PAYPAL_CLIENT_ID=${PAYPAL_ID}
PAYPAL_API_URL=https://api-m.sandbox.paypal.com
EOF
                """

                sh """
                    export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT}

                    # Step 1: Pull image terbaru dari registry
                    docker-compose -f docker-compose.yml pull || true

                    # Step 2: Update backend-1, biarkan backend-2 tetap melayani traffic
                    echo ">>> Deploying backend-proshopv2-1 ..."
                    docker-compose -f docker-compose.yml up -d --no-deps --force-recreate backend-proshopv2-1
                    sleep 12

                    # Step 3: Update backend-2
                    echo ">>> Deploying backend-proshopv2-2 ..."
                    docker-compose -f docker-compose.yml up -d --no-deps --force-recreate backend-proshopv2-2
                    sleep 12

                    # Step 4: Update frontend
                    echo ">>> Deploying frontend-proshopv2 ..."
                    docker-compose -f docker-compose.yml up -d --no-deps --force-recreate frontend-proshopv2
                    sleep 8

                    # Step 5: Reload nginx
                    echo ">>> Reloading nginx ..."
                    docker-compose -f docker-compose.yml up -d --no-deps nginx

                    echo ">>> Status container setelah deploy:"
                    docker-compose -f docker-compose.yml ps
                """
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 7 — HEALTH CHECK
        // ──────────────────────────────────────────────────────────
        stage('Health Check') {
            when {
                anyOf { branch 'main'; branch 'master' }
            }
            steps {
                echo "=== [7] Post-Deploy Health Check ==="
                sh """
                    MAX_RETRY=12
                    WAIT_SEC=10
                    URL="http://localhost:${APP_PORT}/api/products"

                    echo "Checking: \$URL"
                    for i in \$(seq 1 \$MAX_RETRY); do
                        HTTP_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" \$URL || echo "000")
                        echo "  Attempt \$i/\$MAX_RETRY → HTTP \$HTTP_STATUS"
                        if [ "\$HTTP_STATUS" = "200" ]; then
                            echo "✅ Health check PASSED!"
                            exit 0
                        fi
                        sleep \$WAIT_SEC
                    done

                    echo "❌ Health check GAGAL setelah \$((MAX_RETRY * WAIT_SEC))s"
                    docker-compose -f docker-compose.yml logs --tail=80
                    exit 1
                """
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    // POST ACTIONS
    // ──────────────────────────────────────────────────────────────
    post {
        always {
            sh 'rm -f .env || true'
            sh 'docker image prune -f || true'
        }
        success {
            echo """
╔════════════════════════════════════════╗
║  ✅  PIPELINE SUCCESS                  ║
╠════════════════════════════════════════╣
║  Branch : ${env.GIT_BRANCH ?: '-'}
║  Commit : ${env.GIT_COMMIT?.take(7) ?: '-'}
║  Image  : ${env.IMAGE_TAG ?: '-'}
║  Author : ${env.GIT_AUTHOR ?: '-'}
╚════════════════════════════════════════╝"""
        }
        failure {
            echo """
╔════════════════════════════════════════╗
║  ❌  PIPELINE FAILED                   ║
╠════════════════════════════════════════╣
║  Branch : ${env.GIT_BRANCH ?: '-'}
║  Commit : ${env.GIT_COMMIT?.take(7) ?: '-'}
║  Action : Rollback container dimulai   ║
╚════════════════════════════════════════╝"""
            sh 'docker-compose -f docker-compose.yml restart || true'
        }
        unstable {
            echo "⚠️  UNSTABLE — Test gagal, deployment dibatalkan."
        }
    }
}