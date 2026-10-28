import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: android/keystore.properties (git-ignored) with storeFile, storePassword, keyAlias, keyPassword.
// Without it the release build is left unsigned.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
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

android {
    namespace = "app.logviewerlite"
    compileSdk = 34

    defaultConfig {
        applicationId = "aero.speedbird.speedlog"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (keystoreProps.containsKey("storeFile")) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // The task as source dir: every task that reads the assets (merge, lint) depends on the copy
    sourceSets["main"].assets.srcDir(copyWebApp)
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
