if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "C:/Users/Rising/.gradle/caches/8.14.3/transforms/1bee6ccf3fffea42dc5eddb5cd440a29/transformed/hermes-android-0.81.5-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/Rising/.gradle/caches/8.14.3/transforms/1bee6ccf3fffea42dc5eddb5cd440a29/transformed/hermes-android-0.81.5-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

