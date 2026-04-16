import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "react-native-paper";
interface Announcement {
    id:string ;
    titulo:string;
    descripcion :string;
    fecha:string;
    autor:string;
}
interface Props {
    announcement:Announcement;
    onEdit:()=>void;
    onDelete:()=>void;
}

export default function AnnouncementCard ({announcement,onEdit,onDelete}:Props){
    return (
        <View style={styles.card}>
            <Text style={styles.title}>{announcement.titulo}</Text>
            <Text style={styles.descripcion}>{announcement.descripcion}</Text>
            <Text style={styles.meta}>{new Date(announcement.fecha).toLocaleDateString()}-{announcement.autor}</Text>
           {(onEdit || onDelete) &&(
            <View style={styles.actions}>
                {onEdit &&(
                    <Button  mode="contained" buttonColor="#52afecff" onPress={onEdit}>Editar</Button>
                )}
                {onDelete &&(
                    <Button  mode="contained" buttonColor="#bb0d0d" onPress={onDelete}>Eliminar</Button>
                )}
        </View>
    )}
    </View>
    );
}

const styles =StyleSheet.create({
    card:{
        backgroundColor :"white",
        borderRadius:10,
        padding:15,
        marginBottom:15,
        elevation:3,
    },
    title:{fontSize:18 , fontWeight:"bold" , marginBottom:5, color:"#34aaf8ff"},
    descripcion:{fontSize:14 , marginBottom:10 , color:"#333"},
    meta:{fontSize:12 , color:"gray" , marginBottom:10},
    actions:{flexDirection:"row" , justifyContent:"flex-end"},
});