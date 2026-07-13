# Backend: ASP.NET Core Web-API (TodoApi). Build-Context ist das Repo-Root,
# da TodoApi.csproj dort liegt; siehe .dockerignore für ausgeschlossene Pfade
# (u.a. die MAUI-App unter App/ und das Next.js-Frontend unter Nextjs/).

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY TodoApi.csproj ./
RUN dotnet restore TodoApi.csproj

COPY . .
RUN dotnet publish TodoApi.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Bild-Uploads (siehe ObjectImage) werden unter /app/uploads abgelegt; im
# Compose-Setup wird darüber ein Volume gemountet, damit sie einen
# Container-Neustart überleben.
RUN mkdir -p /app/uploads

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "TodoApi.dll"]
