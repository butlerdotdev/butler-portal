// LogoIcon.tsx
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
	logo: {
		width: 34,
		height: 34,
		borderRadius: 8,
		objectFit: 'contain',
	},
});

const LogoIcon = () => {
	const classes = useStyles();
	return <img src="/butler-portal-logo.png" alt="Butler Portal" className={classes.logo} />;
};

export default LogoIcon;
