// ============================================================
//  Jenkinsfile — devops-app CI/CD Pipeline
//  Stages: Lint → Test → Build → Scan → Update Manifest
// ============================================================

pipeline {

    agent any

    // ── Options ──────────────────────────────────────────────
    options {
        timestamps()                          // Tampilkan timestamp di setiap log
        ansiColor('xterm')                    // Warnai output log (butuh plugin AnsiColor)
        disableConcurrentBuilds()             // Cegah 2 build jalan bersamaan
        buildDiscarder(logRotator(
            numToKeepStr: '10',               // Simpan 10 build terakhir
            artifactNumToKeepStr: '5'
        ))
        timeout(time: 30, unit: 'MINUTES')    // Batas maksimal durasi pipeline
    }

    // ── Environment Variables ─────────────────────────────────
    environment {
        // Registry
        REGISTRY          = "registry.gitlab.com"
        PROJECT_PATH      = "artamias/devops-app"
        BACKEND_IMAGE     = "${REGISTRY}/${PROJECT_PATH}/backend"
        FRONTEND_IMAGE    = "${REGISTRY}/${PROJECT_PATH}/frontend"
        IMAGE_TAG         = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"
    }

    // ── Stages ───────────────────────────────────────────────
    stages {

        // ── 1. CHECKOUT ───────────────────────────────────────
        stage('🔍 Checkout') {
            steps {
                checkout scm
                script {
                    env.SHORT_SHA = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                    env.BRANCH_NAME_CLEAN = env.BRANCH_NAME?.replaceAll('/', '-') ?: 'unknown'
                    echo "📦 Branch : ${env.BRANCH_NAME}"
                    echo "🔖 Commit : ${env.SHORT_SHA}"
                }
            }
        }

        // ── 2. LINT ───────────────────────────────────────────
        stage('🔎 Lint') {
            agent {
                docker {
                    image 'node:20-alpine'
                    reuseNode true
                }
            }
            steps {
                dir('frontend') {
                    sh '''
                        echo "── Installing dependencies ──"
                        npm ci --prefer-offline

                        echo "── Running ESLint ──"
                        npx eslint src/ --format stylish || true
                    '''
                }
            }
            post {
                always {
                    echo "✅ Lint selesai (allow_failure = true)"
                }
            }
        }

        // ── 3. TEST (Paralel) ─────────────────────────────────
        stage('🧪 Test') {
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
                                echo "── Installing frontend dependencies ──"
                                npm ci --prefer-offline

                                echo "── Running frontend tests ──"
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
                            echo "── Installing backend dependencies ──"
                            npm ci --prefer-offline

                            echo "── Running backend tests ──"
                            npm test || echo "⚠️  Warning: No tests defined for backend"
                        '''
                    }
                }

            } // end parallel
        }

        // ── 4. BUILD & PUSH ───────────────────────────────────
        stage('🐳 Build & Push') {
            when {
                branch 'main'
            }
            steps {
                script {
                    withCredentials([usernamePassword(
                        credentialsId: env.REGISTRY_CREDS,
                        usernameVariable: 'REG_USER',
                        passwordVariable: 'REG_PASS'
                    )]) {
                        sh '''
                            echo "── Docker login ──"
                            echo "$REG_PASS" | docker login $REGISTRY \
                                -u "$REG_USER" --password-stdin

                            echo "── Build Backend ──"
                            docker build \
                                --label "git.commit=${SHORT_SHA}" \
                                --label "build.number=${BUILD_NUMBER}" \
                                -t ${BACKEND_IMAGE}:${SHORT_SHA} \
                                -t ${BACKEND_IMAGE}:latest \
                                ./backend

                            echo "── Push Backend ──"
                            docker push ${BACKEND_IMAGE}:${SHORT_SHA}
                            docker push ${BACKEND_IMAGE}:latest

                            echo "── Build Frontend ──"
                            docker build \
                                --label "git.commit=${SHORT_SHA}" \
                                --label "build.number=${BUILD_NUMBER}" \
                                -t ${FRONTEND_IMAGE}:${SHORT_SHA} \
                                -t ${FRONTEND_IMAGE}:latest \
                                ./frontend

                            echo "── Push Frontend ──"
                            docker push ${FRONTEND_IMAGE}:${SHORT_SHA}
                            docker push ${FRONTEND_IMAGE}:latest
                        '''
                    }
                }
            }
        }

        // ── 5. SECURITY SCAN ─────────────────────────────────
        stage('🛡️ Security Scan') {
            when {
                branch 'main'
            }
            steps {
                script {
                    withCredentials([usernamePassword(
                        credentialsId: env.REGISTRY_CREDS,
                        usernameVariable: 'TRIVY_USERNAME',
                        passwordVariable: 'TRIVY_PASSWORD'
                    )]) {
                        sh '''
                            echo "── Scan Backend Image ──"
                            docker run --rm \
                                -e TRIVY_USERNAME=${TRIVY_USERNAME} \
                                -e TRIVY_PASSWORD=${TRIVY_PASSWORD} \
                                aquasec/trivy:latest image \
                                    --severity HIGH,CRITICAL \
                                    --exit-code 0 \
                                    --format table \
                                    ${BACKEND_IMAGE}:${SHORT_SHA}

                            echo "── Scan Frontend Image ──"
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
        }

        // ── 6. UPDATE MANIFEST (GitOps) ───────────────────────
      //   stage('📝 Update Manifest') {
      //       when {
      //           branch 'main'
      //       }
      //       agent {
      //           docker {
      //               image 'alpine:latest'
      //               reuseNode true
      //           }
      //       }
      //       steps {
      //           script {
      //               withCredentials([string(
      //                   credentialsId: env.GITLAB_TOKEN_CRED,
      //                   variable: 'GITLAB_TOKEN'
      //               )]) {
      //                   sh '''
      //                       apk add --no-cache git > /dev/null 2>&1

      //                       git config --global user.email "jenkins-bot@devops-app.com"
      //                       git config --global user.name  "Jenkins CI Bot"
      //                       git config --global --add safe.directory '*'

      //                       echo "── Clone repo manifest ──"
      //                       git clone --depth=1 \
      //                           https://oauth2:${GITLAB_TOKEN}@gitlab.com/${PROJECT_PATH}.git \
      //                           manifest-update

      //                       cd manifest-update

      //                       echo "── Update image tag di manifest ──"
      //                       sed -i "s|image: .*/backend:.*|image: ${BACKEND_IMAGE}:${SHORT_SHA}|g" \
      //                           k8s/backend-deployment.yaml
      //                       sed -i "s|image: .*/frontend:.*|image: ${FRONTEND_IMAGE}:${SHORT_SHA}|g" \
      //                           k8s/frontend-deployment.yaml

      //                       echo "── Commit & push jika ada perubahan ──"
      //                       git add k8s/
      //                       git diff --cached --quiet && echo "Tidak ada perubahan manifest" || \
      //                           git commit -m "chore: update image tag to ${SHORT_SHA} [skip ci]" && \
      //                           git push origin HEAD:main

      //                       rm -rf manifest-update
      //                   '''
      //               }
      //           }
      //       }
      //   }

    } // end stages

    // ── Post Actions ─────────────────────────────────────────
    post {

        success {
            echo """
            ╔══════════════════════════════════════════╗
            ║   ✅  PIPELINE BERHASIL                  ║
            ║   Branch  : ${env.BRANCH_NAME}
            ║   Commit  : ${env.SHORT_SHA}
            ║   Build   : #${env.BUILD_NUMBER}
            ╚══════════════════════════════════════════╝
            """
        }

        failure {
            echo """
            ╔══════════════════════════════════════════╗
            ║   ❌  PIPELINE GAGAL                     ║
            ║   Stage   : ${env.STAGE_NAME}
            ║   Branch  : ${env.BRANCH_NAME}
            ║   Commit  : ${env.SHORT_SHA}
            ╚══════════════════════════════════════════╝
            """
        }

        always {
            script {
                // Bersihkan image Docker lokal agar disk tidak penuh
                sh '''
                    docker rmi ${BACKEND_IMAGE}:${SHORT_SHA}  2>/dev/null || true
                    docker rmi ${FRONTEND_IMAGE}:${SHORT_SHA} 2>/dev/null || true
                    docker rmi ${BACKEND_IMAGE}:latest        2>/dev/null || true
                    docker rmi ${FRONTEND_IMAGE}:latest       2>/dev/null || true
                    docker image prune -f                     2>/dev/null || true
                '''
            }
            cleanWs()   // Bersihkan workspace Jenkins
        }

    }

} // end pipeline