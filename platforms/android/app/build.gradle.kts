plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
    namespace = "io.github.jaimegaming.wave"
    compileSdk = 36
    defaultConfig { applicationId = "io.github.jaimegaming.wave"; minSdk = 26; targetSdk = 36; versionCode = 2; versionName = "0.1.1" }
    buildFeatures { compose = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
kotlin { jvmToolchain(17) }
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.09.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.core:core-ktx:1.16.0")
    // The media session is what puts the song on the lock screen, in the shade
    // and in a car, and what lets a headset pause it.
    implementation("androidx.media:media:1.7.0")
    testImplementation("junit:junit:4.13.2")
}
