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
// Everything that reads the assets (merge, lint) must run after the copy, or the APK keeps an old page
tasks.configureEach {
    if (name.endsWith("Assets") || name.contains("lint", ignoreCase = true)) dependsOn(copyWebApp)
}

android {
    namespace = "app.logviewerlite"
    compileSdk = 36

    defaultConfig {
        applicationId = "speed.log"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "1.3"
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

    sourceSets["main"].assets.srcDir(webappDir)
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
