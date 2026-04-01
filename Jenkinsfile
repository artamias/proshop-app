pipeline {
    agent any

    environment {
        // ── Ganti sesuai setup kamu ──────────────────────────────
        IMAGE_BACKEND   = 'proshopv2-backend'
        IMAGE_FRONTEND  = 'proshopv2-frontend'
        REGISTRY        = 'your-dockerhub-username'       // cth: artamias
        DEPLOY_USER     = 'ubuntu'
        DEPLOY_HOST     = 'your-server-ip-or-domain'
        DEPLOY_PATH     = '/opt/proshop'
        // ─────────────────────────────────────────────────────────

        // Tag image = nomor build Jenkins, sehingga setiap build unik
        IMAGE_TAG       = "v${BUILD_NUMBER}"

        // Full image name dengan registry prefix
        BACKEND_IMAGE   = "${REGISTRY}/${IMAGE_BACKEND}:${IMAGE_TAG}"
        FRONTEND_IMAGE  = "${REGISTRY}/${IMAGE_FRONTEND}:${IMAGE_TAG}"

        // Credentials dari Jenkins Credentials Manager
        DOCKER_CREDS    = credentials('dockerhub-credentials')   // Username+Password
        MONGO_URI       = credentials('proshop-mongo-uri')
        JWT_SECRET      = credentials('proshop-jwt-secret')
        PAYPAL_ID       = credentials('proshop-paypal-id')
    }

    stages {

        // ──────────────────────────────────────────────────────────
        // STAGE 1: Clone repo terbaru dari GitHub
        // ──────────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                echo ">>> Checkout kode dari GitHub (branch: ${GIT_BRANCH})..."
                checkout scm
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 2: Jalankan test SEBELUM build image
        //          (lebih hemat — tidak perlu build dulu kalau test gagal)
        // ──────────────────────────────────────────────────────────
        stage('Test') {
            parallel {
                stage('Backend Test') {
                    steps {
                        echo '>>> Test backend...'
                        sh '''
                            npm install
                            npm test --if-present
                        '''
                    }
                }
                stage('Frontend Test') {
                    steps {
                        echo '>>> Test frontend...'
                        dir('frontend') {
                            sh '''
                                npm install
                                CI=true npm test --if-present
                            '''
                        }
                    }
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 3: Build Docker image untuk backend & frontend
        // ──────────────────────────────────────────────────────────
        stage('Build Docker Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        echo ">>> Build image: ${BACKEND_IMAGE}"
                        sh """
                            docker build \
                                -t ${BACKEND_IMAGE} \
                                -t ${REGISTRY}/${IMAGE_BACKEND}:latest \
                                -f Dockerfile \
                                .
                        """
                        // -f Dockerfile → sesuaikan path Dockerfile backend kamu
                    }
                }
                stage('Build Frontend') {
                    steps {
                        echo ">>> Build image: ${FRONTEND_IMAGE}"
                        sh """
                            docker build \
                                -t ${FRONTEND_IMAGE} \
                                -t ${REGISTRY}/${IMAGE_FRONTEND}:latest \
                                -f frontend/Dockerfile \
                                ./frontend
                        """
                        // -f frontend/Dockerfile → sesuaikan path Dockerfile frontend
                    }
                }
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 4: Push image ke Docker Hub (atau private registry)
        // Hanya jika branch main/master
        // ──────────────────────────────────────────────────────────
        stage('Push to Registry') {
            when {
                anyOf { branch 'main'; branch 'master' }
            }
            steps {
                echo '>>> Login & push image ke Docker Hub...'
                sh """
                    echo ${DOCKER_CREDS_PSW} | docker login -u ${DOCKER_CREDS_USR} --password-stdin
                    docker push ${BACKEND_IMAGE}
                    docker push ${REGISTRY}/${IMAGE_BACKEND}:latest
                    docker push ${FRONTEND_IMAGE}
                    docker push ${REGISTRY}/${IMAGE_FRONTEND}:latest
                """
            }
        }

        // ──────────────────────────────────────────────────────────
        // STAGE 5: Deploy ke server production via SSH
        // ──────────────────────────────────────────────────────────
        stage('Deploy') {
            when {
                anyOf { branch 'main'; branch 'master' }
            }
            steps {
                echo ">>> Deploy ke ${DEPLOY_HOST}..."

                // 1. Tulis .env yang akan dikirim ke server
                sh """
                    cat > .env.production << EOF
NODE_ENV=production
PORT=5000
MONGO_URI=${MONGO_URI}
JWT_SECRET=${JWT_SECRET}
PAYPAL_CLIENT_ID=${PAYPAL_ID}
EOF
                """

                // 2. Update docker-compose.yml dengan tag image baru
                sh """
                    sed -i 's|${IMAGE_BACKEND}:.*|${IMAGE_BACKEND}:${IMAGE_TAG}|g' docker-compose.yml
                    sed -i 's|${IMAGE_FRONTEND}:.*|${IMAGE_FRONTEND}:${IMAGE_TAG}|g' docker-compose.yml
                """

                // 3. Kirim file ke server & jalankan docker compose
                sshagent(['proshop-deploy-ssh-key']) {
                    sh """
                        # Buat folder di server kalau belum ada
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'mkdir -p ${DEPLOY_PATH}'

                        # Kirim docker-compose.yml dan .env
                        scp docker-compose.yml ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/docker-compose.yml
                        scp .env.production    ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env
                    """

                    sh """
                        ssh ${DEPLOY_USER}@${DEPLOY_HOST} '
                            cd ${DEPLOY_PATH}

                            # Login Docker di server tujuan
                            echo ${DOCKER_CREDS_PSW} | docker login -u ${DOCKER_CREDS_USR} --password-stdin

                            # Pull image terbaru
                            docker compose pull

                            # Restart container dengan zero-downtime sederhana:
                            # up -d hanya restart service yang imagenya berubah
                            docker compose up -d --remove-orphans

                            # Bersihkan image lama (hemat disk)
                            docker image prune -f

                            # Tampilkan status container sebagai log
                            docker compose ps
                        '
                    """
                }
            }
        }

    } // end stages

    // ──────────────────────────────────────────────────────────────
    // POST: Cleanup & notifikasi
    // ──────────────────────────────────────────────────────────────
    post {
        success {
            echo """
            ✓ Pipeline sukses!
              Backend  : ${BACKEND_IMAGE}
              Frontend : ${FRONTEND_IMAGE}
              Deploy ke: ${DEPLOY_HOST}
            """
            // Aktifkan salah satu notifikasi:
            // mail to: 'kamu@email.com',
            //      subject: "[Jenkins] ProShop Build #${BUILD_NUMBER} SUKSES",
            //      body: "Image: ${BACKEND_IMAGE} | ${FRONTEND_IMAGE}\nURL: ${BUILD_URL}"

            // slackSend color: 'good',
            //   message: "ProShop DEPLOY SUKSES - Build #${BUILD_NUMBER} | ${BACKEND_IMAGE}"
        }
        failure {
            echo '✗ Pipeline GAGAL — cek log di Jenkins!'
            // mail to: 'kamu@email.com',
            //      subject: "[Jenkins] ProShop Build #${BUILD_NUMBER} GAGAL",
            //      body: "Stage gagal. Lihat log: ${BUILD_URL}console"

            // slackSend color: 'danger',
            //   message: "ProShop BUILD GAGAL - Build #${BUILD_NUMBER}"
        }
        always {
            // Hapus .env.production supaya tidak tersisa di workspace Jenkins
            sh 'rm -f .env.production'

            // Logout Docker di Jenkins agent
            sh 'docker logout || true'

            cleanWs()
        }
    }

}