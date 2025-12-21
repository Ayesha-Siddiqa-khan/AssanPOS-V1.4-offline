if(NOT TARGET react-native-worklets::worklets)
add_library(react-native-worklets::worklets SHARED IMPORTED)
set_target_properties(react-native-worklets::worklets PROPERTIES
    IMPORTED_LOCATION "E:/Mobile apps projects/AssanPOS-V1.3/node_modules/react-native-worklets/android/build/intermediates/cxx/Debug/1b4y6a3q/obj/x86_64/libworklets.so"
    INTERFACE_INCLUDE_DIRECTORIES "E:/Mobile apps projects/AssanPOS-V1.3/node_modules/react-native-worklets/android/build/prefab-headers/worklets"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

