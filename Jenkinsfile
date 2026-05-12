pipeline {

    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        DOCKERHUB_USER = "artami"
        BACKEND_IMAGE  = "${DOCKERHUB_USER}/devops-app-backend"
        FRONTEND_IMAGE = "${DOCKERHUB_USER}/devops-app-frontend"
        REGISTRY_CREDS = "dockerhub-credentials"
    }

    stages {

        // ── 1. CHECKOUT ───────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.SHORT_SHA = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                    echo "Branch : ${env.BRANCH_NAME}"
                    echo "Commit : ${env.SHORT_SHA}"
                }
            }
        }

        // ── 2. LINT ───────────────────────────────────────────
        stage('Lint') {
            agent {
                docker {
                    image 'node:20-alpine'
                    reuseNode true
                }
            }
            steps {
                dir('frontend') {
                    sh '''
                        npm ci --prefer-offline
                        npx eslint src/ --format stylish || true
                    '''
                }
            }
        }

        // ── 3. TEST (Paralel) ─────────────────────────────────
        stage('Test') {
            parallel {

                stage('Test Frontend') {
                    when {
                        anyOf {
                            changeset "frontend/**"
                            branch 'main'
                        }
                    }
                    agent {
                        docker {
                            image 'node:20-alpine'
                            reuseNode true
                        }
                    }
                    steps {
                        dir('frontend') {
                            sh '''
                                npm ci --prefer-offline
                                CI=true npm test -- --watchAll=false --forceExit
                            '''
                        }
                    }
                    post {
                        always {
                            junit(
                                testResults: 'frontend/junit.xml',
                                allowEmptyResults: true
                            )
                        }
                    }
                }

                stage('Test Backend') {
                    when {
                        anyOf {
                            changeset "backend/**"
                            branch 'main'
                        }
                    }
                    agent {
                        docker {
                            image 'node:20-alpine'
                            reuseNode true
                        }
                    }
                    steps {
                        sh '''
                            npm ci --prefer-offline
                            npm test || echo "Warning: No tests defined for backend"
                        '''
                    }
                }

            } // end parallel
        }

        // ── 4. BUILD & PUSH ───────────────────────────────────
        stage('Build & Push') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: env.REGISTRY_CREDS,
                    usernameVariable: 'DH_USER',   // Docker Hub username
                    passwordVariable: 'DH_TOKEN'   // Docker Hub access token
                )]) {
                    sh '''
                        # Login ke Docker Hub (tanpa URL = default ke hub.docker.com)
                        echo "${DH_TOKEN}" | docker login -u "${DH_USER}" --password-stdin

                        # ── Backend ──
                        docker build \
                            --label "git.commit=${SHORT_SHA}" \
                            --label "build.number=${BUILD_NUMBER}" \
                            -t ${BACKEND_IMAGE}:${SHORT_SHA} \
                            -t ${BACKEND_IMAGE}:latest \
                            ./backend

                        docker push ${BACKEND_IMAGE}:${SHORT_SHA}
                        docker push ${BACKEND_IMAGE}:latest

                        # ── Frontend ──
                        docker build \
                            --label "git.commit=${SHORT_SHA}" \
                            --label "build.number=${BUILD_NUMBER}" \
                            -t ${FRONTEND_IMAGE}:${SHORT_SHA} \
                            -t ${FRONTEND_IMAGE}:latest \
                            ./frontend

                        docker push ${FRONTEND_IMAGE}:${SHORT_SHA}
                        docker push ${FRONTEND_IMAGE}:latest

                        docker logout
                    '''
                }
            }
        }

        // ── 5. SECURITY SCAN ─────────────────────────────────
        stage('Security Scan') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: env.REGISTRY_CREDS,
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_TOKEN'
                )]) {
                    sh '''
                        # ── Scan Backend ──
                        docker run --rm \
                            -e TRIVY_USERNAME="${DH_USER}" \
                            -e TRIVY_PASSWORD="${DH_TOKEN}" \
                            aquasec/trivy:latest image \
                                --severity HIGH,CRITICAL \
                                --exit-code 0 \
                                --format table \
                                ${BACKEND_IMAGE}:${SHORT_SHA}

                        # ── Scan Frontend ──
                        docker run --rm \
                            -e TRIVY_USERNAME="${DH_USER}" \
                            -e TRIVY_PASSWORD="${DH_TOKEN}" \
                            aquasec/trivy:latest image \
                                --severity HIGH,CRITICAL \
                                --exit-code 0 \
                                --format table \
                                ${FRONTEND_IMAGE}:${SHORT_SHA}
                    '''
                }
            }
        }

    } // end stages

    // ── Post Actions ─────────────────────────────────────────
    post {
        success {
            echo "PIPELINE SUCCESS | Branch: ${env.BRANCH_NAME} | Commit: ${env.SHORT_SHA} | Build: #${env.BUILD_NUMBER}"
        }
        failure {
            echo "PIPELINE FAILED | Stage: ${env.STAGE_NAME} | Branch: ${env.BRANCH_NAME} | Commit: ${env.SHORT_SHA}"
        }
        always {
            sh '''
                docker rmi ${BACKEND_IMAGE}:${SHORT_SHA}  2>/dev/null || true
                docker rmi ${FRONTEND_IMAGE}:${SHORT_SHA} 2>/dev/null || true
                docker rmi ${BACKEND_IMAGE}:latest        2>/dev/null || true
                docker rmi ${FRONTEND_IMAGE}:latest       2>/dev/null || true
                docker image prune -f                     2>/dev/null || true
            '''
            cleanWs()
        }
    }

} // end pipeline