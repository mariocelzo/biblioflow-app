"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

type OccupazioneData = {
  ora: string;
  prenotazioni: number;
};

type TrendData = {
  data: string;
  confermate: number;
  noShow: number;
  totale: number;
};

type UtentiData = {
  nome: string;
  prenotazioni: number;
};

type LibriData = {
  titolo: string;
  autore: string;
  prestiti: number;
};

type NoShowData = {
  nome: string;
  valore: number;
  percentuale: string;
};

const COLORS = ['#ef4444', '#22c55e', '#94a3b8'];

export default function StatisticheCharts() {
  const [occupazioneData, setOccupazioneData] = useState<OccupazioneData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [utentiData, setUtentiData] = useState<UtentiData[]>([]);
  const [libriData, setLibriData] = useState<LibriData[]>([]);
  const [noShowData, setNoShowData] = useState<NoShowData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [occupazione, trend, utenti, libri, noShow] = await Promise.all([
          fetch("/api/admin/statistiche?tipo=occupazione-oraria").then(r => r.json()),
          fetch("/api/admin/statistiche?tipo=trend-prenotazioni").then(r => r.json()),
          fetch("/api/admin/statistiche?tipo=utenti-attivi").then(r => r.json()),
          fetch("/api/admin/statistiche?tipo=libri-prestati").then(r => r.json()),
          fetch("/api/admin/statistiche?tipo=tasso-noshow").then(r => r.json()),
        ]);

        setOccupazioneData(occupazione.data);
        setTrendData(trend.data);
        setUtentiData(utenti.data);
        setLibriData(libri.data);
        setNoShowData(noShow.data);
      } catch (error) {
        console.error("Errore nel caricamento delle statistiche:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Occupazione per fascia oraria */}
      <Card>
        <CardHeader>
          <CardTitle>Occupazione per Fascia Oraria</CardTitle>
          <CardDescription>Numero di prenotazioni completate per ora (ultimi 7 giorni)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={occupazioneData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ora" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="prenotazioni" fill="#3b82f6" name="Prenotazioni" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Trend prenotazioni */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Prenotazioni</CardTitle>
          <CardDescription>Andamento giornaliero delle prenotazioni (ultimi 30 giorni)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="confermate" stroke="#22c55e" name="Confermate" strokeWidth={2} />
              <Line type="monotone" dataKey="noShow" stroke="#ef4444" name="No-show" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Grid per utenti e libri */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Utenti più attivi */}
        <Card>
          <CardHeader>
            <CardTitle>Utenti Più Attivi</CardTitle>
            <CardDescription>Top 10 utenti per numero di prenotazioni</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={utentiData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="prenotazioni" fill="#8b5cf6" name="Prenotazioni" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Libri più prestati */}
        <Card>
          <CardHeader>
            <CardTitle>Libri Più Prestati</CardTitle>
            <CardDescription>Top 10 libri per numero di prestiti</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={libriData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="titolo" type="category" width={150} />
                <Tooltip content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as LibriData;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">{data.titolo}</p>
                        <p className="text-sm text-muted-foreground">{data.autore}</p>
                        <p className="text-sm font-semibold mt-1">
                          Prestiti: {data.prestiti}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }} />
                <Bar dataKey="prestiti" fill="#f97316" name="Prestiti" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tasso no-show */}
      <Card>
        <CardHeader>
          <CardTitle>Tasso No-Show</CardTitle>
          <CardDescription>Distribuzione stato prenotazioni (ultimi 30 giorni)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={noShowData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => {
                    const data = entry as unknown as NoShowData;
                    return `${data.nome}: ${data.percentuale}%`;
                  }}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="valore"
                >
                  {noShowData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as NoShowData;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">{data.nome}</p>
                        <p className="text-sm">Totale: {data.valore}</p>
                        <p className="text-sm font-semibold">
                          Percentuale: {data.percentuale}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
