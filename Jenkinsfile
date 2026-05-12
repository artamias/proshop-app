pipeline {

    agent any

    // ── Options ──────────────────────────────────────────────
    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    // ── Environment Variables ─────────────────────────────────
    environment {
        REGISTRY       = "registry.gitlab.com"
        PROJECT_PATH   = "artamias/devops-app"
        BACKEND_IMAGE  = "${REGISTRY}/${PROJECT_PATH}/backend"
        FRONTEND_IMAGE = "${REGISTRY}/${PROJECT_PATH}/frontend"
    }

    // ── Stages ───────────────────────────────────────────────
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
                    usernameVariable: 'REG_USER',
                    passwordVariable: 'REG_PASS'
                )]) {
                    sh '''
                        echo "$REG_PASS" | docker login $REGISTRY \
                            -u "$REG_USER" --password-stdin

                        docker build \
                            --label "git.commit=${SHORT_SHA}" \
                            --label "build.number=${BUILD_NUMBER}" \
                            -t ${BACKEND_IMAGE}:${SHORT_SHA} \
                            -t ${BACKEND_IMAGE}:latest \
                            ./backend
                        docker push ${BACKEND_IMAGE}:${SHORT_SHA}
                        docker push ${BACKEND_IMAGE}:latest

                        docker build \
                            --label "git.commit=${SHORT_SHA}" \
                            --label "build.number=${BUILD_NUMBER}" \
                            -t ${FRONTEND_IMAGE}:${SHORT_SHA} \
                            -t ${FRONTEND_IMAGE}:latest \
                            ./frontend
                        docker push ${FRONTEND_IMAGE}:${SHORT_SHA}
                        docker push ${FRONTEND_IMAGE}:latest
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
                    usernameVariable: 'TRIVY_USERNAME',
                    passwordVariable: 'TRIVY_PASSWORD'
                )]) {
                    sh '''
                        docker run --rm \
                            -e TRIVY_USERNAME=${TRIVY_USERNAME} \
                            -e TRIVY_PASSWORD=${TRIVY_PASSWORD} \
                            aquasec/trivy:latest image \
                                --severity HIGH,CRITICAL \
                                --exit-code 0 \
                                --format table \
                                ${BACKEND_IMAGE}:${SHORT_SHA}

                        docker run --rm \
                            -e TRIVY_USERNAME=${TRIVY_USERNAME} \
                            -e TRIVY_PASSWORD=${TRIVY_PASSWORD} \
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
            echo "PIPELINE FAILED  | Stage: ${env.STAGE_NAME} | Branch: ${env.BRANCH_NAME} | Commit: ${env.SHORT_SHA}"
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