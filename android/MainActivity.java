package com.skedai.app;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import android.widget.TextView;

public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        TextView welcomeText = findViewById(R.id.welcomeText);
        welcomeText.setText("Welcome to SkedAI Mobile");
    }
}