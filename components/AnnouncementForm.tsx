import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, TextInput } from "react-native-paper";

interface Announcement {
    id:string;
    titulo:string;
    descripcion:string;
    fecha:string;
    autor:string;
}
interface Props {
    announcement?:Announcement | null;
    onSave :(data:Omit<Announcement , "id">)=>void;
    onCancel:()=>void ;
}

export default function AnnouncementForm ({announcement,onSave,onCancel}:Props){
    const [titulo , setTitulo] =useState("");
    const [descripcion , setDescripcion] =useState("");
   const [autor , setAutor] =useState("");
    
    useEffect(()=>{
        if(announcement){
            setTitulo(announcement.titulo);
           setDescripcion(announcement.descripcion);
           setAutor(announcement.autor)
        }else{
            setTitulo("");
            setDescripcion("");
            setAutor("");

        }
    }, [announcement]) ;
    const handeleSubmit =() =>{
        onSave({
            titulo,
            descripcion,
            autor,
            fecha:new Date().toISOString(),
        });
    };
    return(
        <ScrollView  style={styles.modalContent}>
            <TextInput label="Titulo" value={titulo} onChangeText={setTitulo} mode="outlined" style={styles.input}/>
            <TextInput label="Descripcion" value={descripcion} onChangeText={setDescripcion}  mode="outlined" multiline numberOfLines={3} style={styles.input}/>
            <TextInput label="Autor" value={autor} onChangeText={setAutor} mode="outlined" style={styles.input}/>
            <View style ={{flexDirection:"row" , justifyContent:"space-between" , marginBottom:10}}>
                <Button mode="contained" buttonColor="#81c9f8ff" onPress ={handeleSubmit}>Guardar</Button>
                <Button mode="contained" buttonColor="grey" onPress ={onCancel}>Cancelar</Button>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    modalContent:{flex:1 , padding:20 , backgroundColor:"f5f5f5"},
    input :{marginBottom:15 , backgroundColor:"#fff"}
})
