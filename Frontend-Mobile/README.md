# HRMS Frontend-Mobile Application

A React Native mobile application for HRMS (Human Resource Management System) built with Expo.

## Project Structure

```
Frontend-Mobile/
├── src/
│   ├── components/           # Reusable React Native components
│   ├── screens/              # Screen components for navigation
│   ├── navigation/           # Navigation configuration
│   ├── context/              # React context providers
│   ├── services/             # API and service implementations
│   ├── utils/                # Utility functions and helpers
│   └── Hooks/                # Custom React hooks
├── assets/                   # Static assets (images, fonts, etc.)
├── android/                  # Android-specific configurations
├── .expo/                    # Expo configuration files
└── config/                   # Configuration files
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development on macOS)

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Set up environment variables:
- Copy `.env.example` to `.env`
- Update API endpoints and other configurations

### Running the Application

Start the development server:
```bash
npm start
```

You can then:
- Run on Android: Press 'a' or select Android from the menu
- Run on iOS: Press 'i' or select iOS from the menu
- Run in web browser: Press 'w' or select Web from the menu

## Key Features

### Components
- Reusable UI components for consistent look and feel
- Form components with validation
- Custom date pickers and input components
- Loading and error states

### Screens
- Employee Dashboard
- Attendance Management
- Leave Management
- OT (Overtime) Management
- Employee Profile Management

### Services
- API integration with backend
- Authentication
- Date and time utilities
- Error handling
- Storage management

## Development

### Code Style
- Follow React Native best practices
- Use functional components with hooks
- Implement proper error boundaries
- Use TypeScript for type safety
- Follow consistent naming conventions

### State Management
- Uses React Context for global state
- Local state management with useState/useReducer
- Proper async state handling

### Date Handling
- Centralized date utilities in `src/utils/dateUtils.js`
- All dates handled in IST timezone
- Consistent date formatting across application
- Proper timezone conversion

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please:
1. Check the existing issues
2. Open a new issue if needed
3. Contact the development team
