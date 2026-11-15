# The echo canceller's shared C core (../cpp, also compiled by the iOS podspec) and its JNI glue.
cmake_minimum_required(VERSION 3.22.1)
project(echo_canceller C)

add_library(echo_canceller SHARED
  ../cpp/echo_cancel.c
  src/main/cpp/echo_canceller_jni.c
)
target_include_directories(echo_canceller PRIVATE ../cpp)
# Optimized in every build type: cleaning a take is number crunching, and debug builds would
# otherwise run it unoptimized (as the podspec does for iOS).
target_compile_options(echo_canceller PRIVATE -O3)
# 16 KB pages (required on Google Play for new apps and updates).
target_link_options(echo_canceller PRIVATE "-Wl,-z,max-page-size=16384")
target_link_libraries(echo_canceller m log)
