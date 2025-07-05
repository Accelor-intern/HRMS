// REDUNDANT FILE TO BE REMOVED
import React from 'react';
import { Dimensions } from 'react-native';
import { PieChart } from 'react-native-chart-kit';

const AttendanceChart = React.memo(({ attendanceData }) => {
  const stats = React.useMemo(() => {
    if (!Array.isArray(attendanceData)) return { present: 0, absent: 0, leave: 0, half: 0 };
    const stats = { present: 0, absent: 0, leave: 0, half: 0 };
    attendanceData.forEach(day => {
      if (day.status === 'present') stats.present++;
      else if (day.status === 'absent') stats.absent++;
      else if (day.status === 'half') stats.half++;
      else if (day.status === 'leave') stats.leave++;
    });
    return stats;
  }, [attendanceData]);
  
  return (
    <PieChart
      data={[
        { name: "Present", population: stats.present, color: "#4CAF50", legendFontColor: "#7F7F7F" },
        { name: "Half Day", population: stats.half, color: "#FFA000", legendFontColor: "#7F7F7F" },
        { name: "Absent", population: stats.absent, color: "#f44336", legendFontColor: "#7F7F7F" },
        { name: "Leave", population: stats.leave, color: "#2196F3", legendFontColor: "#7F7F7F" }
      ]}
      width={Dimensions.get("window").width - 40}
      height={220}
      chartConfig={{
        backgroundColor: "#ffffff",
        backgroundGradientFrom: "#ffffff",
        backgroundGradientTo: "#ffffff",
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
      }}
      accessor="population"
      backgroundColor="transparent"
      paddingLeft="15"
      absolute
    />
  );
});

export default AttendanceChart;
