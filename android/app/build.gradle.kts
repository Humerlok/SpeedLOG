plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The web app is the single-file build from `node build.cjs`, copied into the APK assets
val webappDir = layout.buildDirectory.dir("generated/webapp")
val copyWebApp by tasks.registering(Copy::class) {
    val built = file("../../dist/SpeedLog.html")
    from(built) { rename { "index.html" } }
    into(webappDir)
    doFirst {
        if (!built.exists()) {
            throw GradleException("Missing $built. From the repo root run: node build.cjs")
        }
    }
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(copyWebApp)
}

android {
    namespace = "app.logviewerlite"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.logviewerlite"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].assets.srcDir(webappDir)
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
