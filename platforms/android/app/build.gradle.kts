plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
    namespace = "io.github.jaimegaming.wave"
    compileSdk = 36
    defaultConfig { applicationId = "io.github.jaimegaming.wave"; minSdk = 26; targetSdk = 36; versionCode = 7; versionName = "0.3.0" }
    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("WAVE_ANDROID_KEYSTORE")
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("WAVE_ANDROID_KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("WAVE_ANDROID_KEY_ALIAS") ?: "wave"
                keyPassword = System.getenv("WAVE_ANDROID_KEY_PASSWORD") ?: storePassword
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile != null) {
                signingConfig = releaseSigning
            }
        }
    }
    buildFeatures { compose = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { unitTests.isIncludeAndroidResources = true }
}

// The screenshot run needs the flag inside the test JVM, not just in Gradle's.
tasks.withType(org.gradle.api.tasks.testing.Test::class.java).configureEach {
    // Robolectric resolves Android runtime images itself, separately from Gradle.
    // Use Maven Central's canonical endpoint rather than the unreliable repo1 alias.
    systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2")
    // Resolved against the build root: the test JVM runs inside the module, so a
    // relative path would land in app/app/build.
    System.getProperty("wave.screenshots")?.let {
        systemProperty("wave.screenshots", rootProject.file(it).absolutePath)
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.09.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.core:core-ktx:1.16.0")
    testImplementation("junit:junit:4.13.2")
    // Real Compose rendering on the JVM, for the documentation captures. The
    // manifest dependency brings the host activity the test rule launches.
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
